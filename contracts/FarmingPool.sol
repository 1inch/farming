// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./interfaces/IFarmingPool.sol";
import "./FarmingLib.sol";

contract FarmingPool is IFarmingPool, Ownable, ERC20 {
    using SafeERC20 for IERC20;
    using Address for address payable;
    using FarmingLib for FarmingLib.Info;

    error ZeroStakingTokenAddress();
    error ZeroRewardsTokenAddress();
    error SameDistributor();
    error AccessDenied();
    error NotEnoughBalance();

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    address public distributor;
    FarmingLib.Data private _farm;

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

    function decimals() public view override returns (uint8) {
        return IERC20Metadata(address(stakingToken)).decimals();
    }

    function setDistributor(address distributor_) external onlyOwner {
        address oldDistributor = distributor;
        if (distributor_ == oldDistributor) revert SameDistributor();
        emit DistributorChanged(oldDistributor, distributor_);
        distributor = distributor_;
    }

    function startFarming(uint256 amount, uint256 period) external onlyDistributor {
        uint256 reward = _farmInfo().startFarming(amount, period);
        emit RewardAdded(reward, period);
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function farmed(address account) external view override returns (uint256) {
        return _farmInfo().farmed(account, balanceOf(account));
    }

    function deposit(uint256 amount) external override {
        _mint(msg.sender, amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) public override {
        _burn(msg.sender, amount);
        stakingToken.safeTransfer(msg.sender, amount);
    }

    function claim() public override {
        uint256 amount = _farmInfo().claim(msg.sender, balanceOf(msg.sender));
        if (amount > 0) {
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

    function _farmInfo() internal view returns(FarmingLib.Info memory) {
        return FarmingLib.makeInfo(totalSupply, _farm);
    }

    // ERC20 overrides

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        if (amount > 0 && from != to) {
            _farmInfo().updateBalances(from, to, amount);
        }
    }
}
