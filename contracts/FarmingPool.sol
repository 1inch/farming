// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20, ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import { Distributor } from "./Distributor.sol";
import { Farming, FarmingLib } from "./FarmingLib.sol";
import { IFarmingPool } from "./interfaces/IFarmingPool.sol";

contract FarmingPool is IFarmingPool, Distributor, ERC20 {
    using Address for address payable;
    using FarmingLib for FarmingLib.Info;
    using SafeERC20 for IERC20;

    uint256 internal constant _MAX_BALANCE = 1e32;

    IERC20 public immutable rewardsToken;
    IERC20 public immutable stakingToken;

    FarmingLib.Data private _farm;

    error InsufficientFunds();
    error MaxBalanceExceeded();
    error SameStakingAndRewardsTokens();
    error ZeroStakingTokenAddress();
    error ZeroRewardsTokenAddress();
    
    constructor(IERC20Metadata stakingToken_, IERC20 rewardsToken_)
        ERC20(
            string(abi.encodePacked("Farming of ", stakingToken_.name())),
            string(abi.encodePacked("farm", stakingToken_.symbol()))
        )
    {
        if (stakingToken_ == rewardsToken_) revert SameStakingAndRewardsTokens();
        if (address(stakingToken_) == address(0)) revert ZeroStakingTokenAddress();
        if (address(rewardsToken_) == address(0)) revert ZeroRewardsTokenAddress();
        stakingToken = stakingToken_;
        rewardsToken = rewardsToken_;
    }

    function startFarming(uint256 amount, uint256 period) public virtual onlyDistributor {
        uint256 reward = _makeInfo().updateFarmData(amount, period);
        emit RewardUpdated(reward, period);
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function stopFarming() public virtual onlyDistributor {
        uint256 leftover = _makeInfo().cancelFarming();
        emit RewardUpdated(0, 0);
        if (leftover > 0) {
            rewardsToken.safeTransfer(msg.sender, leftover);
        }
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

    function exit() public virtual {
        withdraw(balanceOf(msg.sender));
        claim();
    }

    function rescueFunds(IERC20 token, uint256 amount) public virtual onlyDistributor {
        if (token == IERC20(address(0))) {
            payable(_distributor).sendValue(amount);
        } else {
            if (token == stakingToken) {
                if (stakingToken.balanceOf(address(this)) < totalSupply() + amount) revert InsufficientFunds();
            } else if (token == rewardsToken) {
                if (rewardsToken.balanceOf(address(this)) < _farm.farmingInfo.balance + amount) revert InsufficientFunds();
            }

            token.safeTransfer(_distributor, amount);
        }
    }

    function decimals() public view virtual override returns (uint8) {
        return IERC20Metadata(address(stakingToken)).decimals();
    }

    function farmInfo() public view returns(Farming.Info memory) {
        return _farm.farmingInfo;
    }

    function farmed(address account) public view virtual returns (uint256) {
        return _makeInfo().farmed(account, balanceOf(account));
    }

    function _transferReward(IERC20 reward, address to, uint256 amount) internal virtual {
        reward.safeTransfer(to, amount);
    }

    // --- ERC20 overrides section start ---
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        if (amount > 0 && from != to) {
            _makeInfo().updateBalances(from, to, amount);
        }
    }
    // --- ERC20 overrides section end ---

    function _makeInfo() private view returns(FarmingLib.Info memory) {
        return FarmingLib.makeInfo(totalSupply, _farm);
    }
}
