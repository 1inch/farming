// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

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
    error MaxBalanceExceeded();

    uint256 internal constant _MAX_BALANCE = 1e32;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    address private _distributor;
    FarmingLib.Data private _farm;

    modifier onlyDistributor {
        if (msg.sender != _distributor) revert AccessDenied();
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

    function decimals() public view virtual override returns (uint8) {
        return IERC20Metadata(address(stakingToken)).decimals();
    }

    function farmInfo() public view returns(FarmAccounting.Info memory) {
        return _farm.farmInfo;
    }

    function distributor() public view virtual returns (address) {
        return _distributor;
    }

    function setDistributor(address distributor_) public virtual onlyOwner {
        address oldDistributor = _distributor;
        if (distributor_ == oldDistributor) revert SameDistributor();
        emit DistributorChanged(oldDistributor, distributor_);
        _distributor = distributor_;
    }

    function startFarming(uint256 amount, uint256 period) public virtual onlyDistributor {
        uint256 reward = _makeInfo().startFarming(amount, period);
        emit RewardAdded(reward, period);
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function farmed(address account) public view virtual returns (uint256) {
        return _makeInfo().farmed(account, balanceOf(account));
    }

    function deposit(uint256 amount) public virtual {
        _mint(msg.sender, amount);
        if (balanceOf(msg.sender) > _MAX_BALANCE) revert MaxBalanceExceeded();
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) public virtual {
        _burn(msg.sender, amount);
        stakingToken.safeTransfer(msg.sender, amount);
    }

    function claim() public virtual {
        uint256 amount = _makeInfo().claim(msg.sender, balanceOf(msg.sender));
        if (amount > 0) {
            _transferReward(rewardsToken, msg.sender, amount);
        }
    }

    function _transferReward(IERC20 reward, address to, uint256 amount) internal virtual {
        reward.safeTransfer(to, amount);
    }

    function exit() public virtual {
        withdraw(balanceOf(msg.sender));
        claim();
    }

    function rescueFunds(IERC20 token, uint256 amount) public virtual onlyDistributor {
        if (token == IERC20(address(0))) {
            payable(_distributor).sendValue(amount);
        } else {
            token.safeTransfer(_distributor, amount);
            if (token == stakingToken) {
                if (stakingToken.balanceOf(address(this)) < totalSupply()) revert NotEnoughBalance();
            }
        }
    }

    function _makeInfo() private view returns(FarmingLib.Info memory) {
        return FarmingLib.makeInfo(totalSupply, _farm);
    }

    // ERC20 overrides

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        if (amount > 0 && from != to) {
            _makeInfo().updateBalances(from, to, amount);
        }
    }
}
