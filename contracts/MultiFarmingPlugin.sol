// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

import { AddressArray, AddressSet } from "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { IERC20Plugins } from "@1inch/token-plugins/contracts/interfaces/IERC20Plugins.sol";
import { Plugin } from "@1inch/token-plugins/contracts/Plugin.sol";

import { Distributor } from "./Distributor.sol";
import { Farming, FarmingLib } from "./FarmingLib.sol";
import { IMultiFarmingPlugin } from "./interfaces/IMultiFarmingPlugin.sol";

contract MultiFarmingPlugin is Plugin, IMultiFarmingPlugin, Distributor {
    using Address for address payable;
    using AddressArray for AddressArray.Data;
    using AddressSet for AddressSet.Data;
    using FarmingLib for FarmingLib.Info;
    using SafeERC20 for IERC20;
    
    uint256 public immutable rewardsTokensLimit;

    mapping(IERC20 => FarmingLib.Data) private _farms;
    AddressSet.Data private _rewardsTokens;
    uint256 private _totalSupply;

    error InsufficientFunds();
    error ZeroFarmableTokenAddress();
    error ZeroRewardsTokenAddress();
    error RewardsTokenAlreadyAdded();
    error RewardsTokenNotFound();
    error RewardsTokensLimitTooHigh(uint256);
    error RewardsTokensLimitReached();

    constructor(IERC20Plugins farmableToken_, uint256 rewardsTokensLimit_) Plugin(farmableToken_) {
        if (rewardsTokensLimit_ > 5) revert RewardsTokensLimitTooHigh(rewardsTokensLimit_);
        if (address(farmableToken_) == address(0)) revert ZeroFarmableTokenAddress();

        rewardsTokensLimit = rewardsTokensLimit_;
    }

    function rewardsTokens() external view returns(address[] memory) {
        return _rewardsTokens.items.get();
    }

    function addRewardsToken(address rewardsToken) public virtual onlyOwner {
        if (rewardsToken == address(0)) revert ZeroRewardsTokenAddress();
        if (_rewardsTokens.length() == rewardsTokensLimit) revert RewardsTokensLimitReached();
        if (!_rewardsTokens.add(rewardsToken)) revert RewardsTokenAlreadyAdded();
        emit FarmCreated(address(token), rewardsToken);
    }

    function startFarming(IERC20 rewardsToken, uint256 amount, uint256 period) public virtual onlyDistributor {
        if (!_rewardsTokens.contains(address(rewardsToken))) revert RewardsTokenNotFound();

        uint256 reward = _makeInfo(rewardsToken).updateFarmData(amount, period);
        emit RewardUpdated(address(rewardsToken), reward, period);
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function stopFarming(IERC20 rewardsToken) public virtual onlyDistributor {
        if (!_rewardsTokens.contains(address(rewardsToken))) revert RewardsTokenNotFound();

        uint256 leftover = _makeInfo(rewardsToken).cancelFarming();
        emit RewardUpdated(address(rewardsToken), 0, 0);
        if (leftover > 0) {
            rewardsToken.safeTransfer(msg.sender, leftover);
        }
    }

    function claim(IERC20 rewardsToken) public virtual {
        uint256 pluginBalance = IERC20Plugins(token).pluginBalanceOf(address(this), msg.sender);
        _claim(rewardsToken, msg.sender, pluginBalance);
    }

    function claim() public virtual {
        uint256 pluginBalance = IERC20Plugins(token).pluginBalanceOf(address(this), msg.sender);
        address[] memory tokens = _rewardsTokens.items.get();
        unchecked {
            uint256 length = tokens.length;
            for (uint256 i = 0; i < length; i++) {
                _claim(IERC20(tokens[i]), msg.sender, pluginBalance);
            }
        }
    }

    function rescueFunds(IERC20 token_, uint256 amount) public virtual onlyDistributor {
        if(token_ == IERC20(address(0))) {
            payable(_distributor).sendValue(amount);
        } else {
            if (_rewardsTokens.contains(address(token_))) {
                if (token_.balanceOf(address(this)) < _farms[token_].farmingInfo.balance + amount) revert InsufficientFunds();
            }
            token_.safeTransfer(_distributor, amount);
        }
    }

    function farmInfo(IERC20 rewardsToken) public view returns(Farming.Info memory) {
        return _farms[rewardsToken].farmingInfo;
    }

    function totalSupply() public view returns(uint256) {
        return _totalSupply;
    }

    function farmed(IERC20 rewardsToken, address account) public view virtual returns(uint256) {
        uint256 balance = IERC20Plugins(token).pluginBalanceOf(address(this), account);
        return _makeInfo(rewardsToken).farmed(account, balance);
    }

    function _transferReward(IERC20 reward, address to, uint256 amount) internal virtual {
        reward.safeTransfer(to, amount);
    }

    function _updateBalances(address from, address to, uint256 amount) internal virtual override {
        address[] memory tokens = _rewardsTokens.items.get();
        unchecked {
            uint256 length = tokens.length;
            for (uint256 i = 0; i < length; i++) {
                _makeInfo(IERC20(tokens[i])).updateBalances(from, to, amount);
            }
        }
        if (from == address(0)) {
            _totalSupply += amount;
        }
        if (to == address(0)) {
            _totalSupply -= amount;
        }
    }

    function _claim(IERC20 rewardsToken, address account, uint256 pluginBalance) private {
        uint256 amount = _makeInfo(rewardsToken).claim(account, pluginBalance);
        if (amount > 0) {
            _transferReward(rewardsToken, account, amount);
        }
    }

    function _makeInfo(IERC20 rewardsToken) private view returns(FarmingLib.Info memory) {
        return FarmingLib.makeInfo(totalSupply, _farms[rewardsToken]);
    }
}
