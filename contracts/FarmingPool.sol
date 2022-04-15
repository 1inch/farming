// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./interfaces/IFarmingPool.sol";
import "./accounting/FarmAccounting.sol";
import "./accounting/UserAccounting.sol";

contract FarmingPool is IFarmingPool, Ownable, ERC20 {
    using SafeERC20 for IERC20;
    using FarmAccounting for FarmAccounting.Info;
    using UserAccounting for UserAccounting.Info;
    using Address for address payable;

    error ZeroStakingTokenAddress();
    error ZeroRewardsTokenAddress();
    error SameDistributor();
    error AccessDenied();
    error ZeroDeposit();
    error ZeroWithdraw();
    error NotEnoughBalance();

    event DistributorChanged(address oldDistributor, address newDistributor);
    event RewardAdded(uint256 reward, uint256 duration);

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    address public distributor;
    FarmAccounting.Info public farmInfo;
    UserAccounting.Info public userInfo;

    modifier onlyDistributor {
        if (msg.sender != distributor) revert AccessDenied();
        _;
    }

    constructor(IERC20Metadata stakingToken_, IERC20 rewardsToken_)
        ERC20(
            string(abi.encodePacked("Farming of ", stakingToken_.name())),
            string(abi.encodePacked("farm", stakingToken_.symbol()))
        )
    {
        if (address(stakingToken_) == address(0)) revert ZeroStakingTokenAddress();
        if (address(rewardsToken_) == address(0)) revert ZeroRewardsTokenAddress();
        stakingToken = stakingToken_;
        rewardsToken = rewardsToken_;
    }

    function setDistributor(address distributor_) external onlyOwner {
        address oldDistributor = distributor;
        if (distributor_ == oldDistributor) revert SameDistributor();
        emit DistributorChanged(oldDistributor, distributor_);
        distributor = distributor_;
    }

    function startFarming(uint256 amount, uint256 period) external onlyDistributor {
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 reward = farmInfo.startFarming(amount, period, _updateCheckpoint);
        emit RewardAdded(reward, period);
    }

    function decimals() public view override returns (uint8) {
        return IERC20Metadata(address(stakingToken)).decimals();
    }

    function farmedPerToken() public view override returns (uint256) {
        return userInfo.farmedPerToken(address(0), _lazyGetSupply, _lazyGetFarmed);
    }

    function farmed(address account) external view override returns (uint256) {
        return userInfo.farmed(account, balanceOf(account), farmedPerToken());
    }

    function deposit(uint256 amount) external override {
        if (amount == 0) revert ZeroDeposit();
        _mint(msg.sender, amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) public override {
        if (amount == 0) revert ZeroWithdraw();
        _burn(msg.sender, amount);
        stakingToken.safeTransfer(msg.sender, amount);
    }

    function claim() public override {
        uint256 fpt = farmedPerToken();
        uint256 balance = balanceOf(msg.sender);
        uint256 amount = userInfo.farmed(msg.sender, balance, fpt);
        if (amount > 0) {
            userInfo.eraseFarmed(msg.sender, balance, fpt);
            rewardsToken.safeTransfer(msg.sender, amount);
        }
    }

    function exit() external override {
        withdraw(balanceOf(msg.sender));
        claim();
    }

    function rescueFunds(IERC20 token, uint256 amount) external onlyDistributor {
        if (token == IERC20(address(0))) {
            payable(distributor).sendValue(amount);
        } else {
            token.safeTransfer(distributor, amount);
            if (token == stakingToken) {
                if (stakingToken.balanceOf(address(this)) < totalSupply()) revert NotEnoughBalance();
            }
        }
    }

    // ERC20 overrides

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        super._beforeTokenTransfer(from, to, amount);

        if (amount > 0 && from != to) {
            userInfo.updateBalances(farmedPerToken(), from, to, amount, from != address(0), to != address(0));
        }
    }

    // UserAccounting bindings

    function _lazyGetSupply(address /* context */) private view returns(uint256) {
        return totalSupply();
    }

    function _lazyGetFarmed(address /* context */, uint256 checkpoint) private view returns(uint256) {
        return farmInfo.farmedSinceCheckpointScaled(checkpoint);
    }

    // FarmAccounting bindings

    function _updateCheckpoint() private {
        userInfo.updateCheckpoint(farmedPerToken());
    }
}
