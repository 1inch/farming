// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20, ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import { IFarmingPool } from "./interfaces/IFarmingPool.sol";
import { Distributor } from "./Distributor.sol";
import { FarmAccounting, FarmingLib } from "./FarmingLib.sol";

contract FarmingPool is IFarmingPool, Distributor, ERC20 {
    using SafeERC20 for IERC20;
    using Address for address payable;
    using FarmingLib for FarmingLib.Info;

    error SameStakingAndRewardsTokens();
    error ZeroStakingTokenAddress();
    error ZeroRewardsTokenAddress();
    error AccessDenied();
    error InsufficientFunds();
    error MaxBalanceExceeded();

    uint256 internal constant _MAX_BALANCE = 1e32;

    IERC20 public immutable STAKING_TOKEN;
    IERC20 public immutable REWARDS_TOKEN;

    FarmingLib.Data private _farm;

    constructor(IERC20Metadata stakingToken_, IERC20 rewardsToken_, address owner_)
        ERC20(
            string(abi.encodePacked("Farming of ", stakingToken_.name())),
            string(abi.encodePacked("farm", stakingToken_.symbol()))
        )
        Distributor(owner_)
    {
        if (stakingToken_ == rewardsToken_) revert SameStakingAndRewardsTokens();
        if (address(stakingToken_) == address(0)) revert ZeroStakingTokenAddress();
        if (address(rewardsToken_) == address(0)) revert ZeroRewardsTokenAddress();
        STAKING_TOKEN = stakingToken_;
        REWARDS_TOKEN = rewardsToken_;
    }

    function decimals() public view virtual override returns (uint8) {
        return IERC20Metadata(address(STAKING_TOKEN)).decimals();
    }

    function farmInfo() public view returns(FarmAccounting.Info memory) {
        return _farm.farmInfo;
    }

    function startFarming(uint256 amount, uint256 period) public virtual onlyDistributor {
        uint256 reward = _makeInfo().startFarming(amount, period);
        emit RewardUpdated(reward, period);
        REWARDS_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
    }

    function stopFarming() public virtual onlyDistributor {
        uint256 leftover = _makeInfo().stopFarming();
        emit RewardUpdated(0, 0);
        if (leftover > 0) {
            REWARDS_TOKEN.safeTransfer(msg.sender, leftover);
        }
    }

    function farmed(address account) public view virtual returns (uint256) {
        return _makeInfo().farmed(account, balanceOf(account));
    }

    function deposit(uint256 amount) public virtual {
        _mint(msg.sender, amount);
        if (balanceOf(msg.sender) > _MAX_BALANCE) revert MaxBalanceExceeded();
        STAKING_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) public virtual {
        _burn(msg.sender, amount);
        STAKING_TOKEN.safeTransfer(msg.sender, amount);
    }

    function claim() public virtual {
        uint256 amount = _makeInfo().claim(msg.sender, balanceOf(msg.sender));
        if (amount > 0) {
            _transferReward(REWARDS_TOKEN, msg.sender, amount);
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
            if (token == STAKING_TOKEN) {
                if (STAKING_TOKEN.balanceOf(address(this)) < totalSupply() + amount) revert InsufficientFunds();
            } else if (token == REWARDS_TOKEN) {
                if (REWARDS_TOKEN.balanceOf(address(this)) < _farm.farmInfo.balance + amount) revert InsufficientFunds();
            }

            token.safeTransfer(_distributor, amount);
        }
    }

    function _makeInfo() private view returns(FarmingLib.Info memory) {
        return FarmingLib.makeInfo(totalSupply, _farm);
    }

    // ERC20 overrides

    function _update(address from, address to, uint256 amount) internal virtual override {
        if (amount > 0 && from != to) {
            _makeInfo().updateBalances(from, to, amount);
        }
        super._update(from, to, amount);
    }
}
