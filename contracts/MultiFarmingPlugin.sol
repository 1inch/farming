// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { Plugin } from "@1inch/token-plugins/contracts/Plugin.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { AddressArray, AddressSet } from "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";
import { IERC20Plugins } from "@1inch/token-plugins/contracts/interfaces/IERC20Plugins.sol";

import { IMultiFarmingPlugin } from "./interfaces/IMultiFarmingPlugin.sol";
import { FarmAccounting, FarmingLib } from "./FarmingLib.sol";
import { WithdrawableGetters } from "./WithdrawableGetters.sol";

contract MultiFarmingPlugin is Plugin, IMultiFarmingPlugin, Ownable, WithdrawableGetters {
    using SafeERC20 for IERC20;
    using FarmingLib for FarmingLib.Info;
    using Address for address payable;
    using AddressSet for AddressSet.Data;
    using AddressArray for AddressArray.Data;

    error ZeroFarmableTokenAddress();
    error ZeroRewardsTokenAddress();
    error ZeroDistributorAddress();
    error SameDistributor();
    error RewardsTokenAlreadyAdded();
    error RewardsTokensLimitTooHigh(uint256);
    error RewardsTokensLimitReached();
    error RewardsTokenNotFound();

    uint256 public immutable rewardsTokensLimit;

    address private _distributor;
    uint256 private _totalSupply;
    mapping(IERC20 => FarmingLib.Data) private _farms;
    AddressSet.Data private _rewardsTokens;

    modifier onlyDistributor {
        if (msg.sender != _distributor) revert AccessDenied();
        _;
    }

    constructor(IERC20Plugins farmableToken_, uint256 rewardsTokensLimit_) Plugin(farmableToken_) {
        if (rewardsTokensLimit_ > 5) revert RewardsTokensLimitTooHigh(rewardsTokensLimit_);
        if (address(farmableToken_) == address(0)) revert ZeroFarmableTokenAddress();

        rewardsTokensLimit = rewardsTokensLimit_;
    }

    function rewardsTokens() external view returns(address[] memory) {
        return _rewardsTokens.items.get();
    }

    function farmInfo(IERC20 rewardsToken) public view returns(FarmAccounting.Info memory) {
        return _farms[rewardsToken].farmInfo;
    }

    function totalSupply() public view returns(uint256) {
        return _totalSupply;
    }

    function distributor() public view returns(address) {
        return _distributor;
    }

    function setDistributor(address distributor_) public virtual onlyOwner {
        if (distributor_ == address(0)) revert ZeroDistributorAddress();
        address oldDistributor = _distributor;
        if (distributor_ == oldDistributor) revert SameDistributor();
        emit DistributorChanged(oldDistributor, distributor_);
        _distributor = distributor_;
    }

    function addRewardsToken(address rewardsToken) public virtual onlyOwner {
        if (rewardsToken == address(0)) revert ZeroRewardsTokenAddress();
        if (_rewardsTokens.length() == rewardsTokensLimit) revert RewardsTokensLimitReached();
        if (!_rewardsTokens.add(rewardsToken)) revert RewardsTokenAlreadyAdded();
        emit FarmCreated(address(token), rewardsToken);
    }

    function startFarming(IERC20 rewardsToken, uint256 amount, uint256 period) public virtual onlyDistributor {
        if (!_rewardsTokens.contains(address(rewardsToken))) revert RewardsTokenNotFound();

        uint256 reward = _makeInfo(rewardsToken).startFarming(amount, period);
        emit RewardUpdated(address(rewardsToken), reward, period);
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function farmed(IERC20 rewardsToken, address account) public view virtual returns(uint256) {
        uint256 balance = IERC20Plugins(token).pluginBalanceOf(address(this), account);
        return _makeInfo(rewardsToken).farmed(account, balance);
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

    function _claim(IERC20 rewardsToken, address account, uint256 pluginBalance) private {
        uint256 amount = _makeInfo(rewardsToken).claim(account, pluginBalance);
        if (amount > 0) {
            _transferReward(rewardsToken, account, amount);
        }
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

    function rescueFunds(IERC20 token_) public virtual onlyDistributor {
        if(token_ == IERC20(address(0))) {
            payable(_distributor).sendValue(address(this).balance);
        } else {
            uint256 amount;
            if (_rewardsTokens.contains(address(token_))) {
                amount = _makeInfo(token_).stopFarming();
                emit FarmingStopped();
            } else {
                amount = token_.balanceOf(address(this));
            }
            token_.safeTransfer(_distributor, amount);
        }
    }

    function _withdrawable(IERC20 token_, uint256 timestamp) internal view override returns(uint256) {
        if (token_ == IERC20(address(0))) {
            return address(this).balance;
        }
        if (_rewardsTokens.contains(address(token_))) {
            return _makeInfo(token_).undistributedRewards(timestamp);
        }
        return token_.balanceOf(address(this));
    }

    function _makeInfo(IERC20 rewardsToken) private view returns(FarmingLib.Info memory) {
        return FarmingLib.makeInfo(totalSupply, _farms[rewardsToken]);
    }
}
