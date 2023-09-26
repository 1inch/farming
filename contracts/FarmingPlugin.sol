// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Plugin } from "@1inch/token-plugins/contracts/Plugin.sol";
import { IERC20Plugins } from "@1inch/token-plugins/contracts/interfaces/IERC20Plugins.sol";

import { IFarmingPlugin } from "./interfaces/IFarmingPlugin.sol";
import { FarmingLib, Farming } from "./FarmingLib.sol";

contract FarmingPlugin is Plugin, IFarmingPlugin, Ownable {
    using SafeERC20 for IERC20;
    using FarmingLib for FarmingLib.Info;
    using Farming for Farming.Info;
    using Address for address payable;

    IERC20 public immutable rewardsToken;

    address private _distributor;
    uint256 private _totalSupply;
    FarmingLib.Data private _farm;

    error ZeroFarmableTokenAddress();
    error ZeroRewardsTokenAddress();
    error ZeroDistributorAddress();
    error SameDistributor();
    error InsufficientFunds();

    modifier onlyDistributor {
        if (msg.sender != _distributor) revert AccessDenied();
        _;
    }

    constructor(IERC20Plugins farmableToken_, IERC20 rewardsToken_)
        Plugin(farmableToken_)
    {
        if (address(farmableToken_) == address(0)) revert ZeroFarmableTokenAddress();
        if (address(rewardsToken_) == address(0)) revert ZeroRewardsTokenAddress();
        rewardsToken = rewardsToken_;
        emit FarmCreated(address(farmableToken_), address(rewardsToken_));
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

    function setDistributor(address distributor_) public virtual onlyOwner {
        if (distributor_ == address(0)) revert ZeroDistributorAddress();
        address oldDistributor = _distributor;
        if (distributor_ == oldDistributor) revert SameDistributor();
        emit DistributorChanged(oldDistributor, distributor_);
        _distributor = distributor_;
    }

    function claim() public virtual {
        uint256 pluginBalance = IERC20Plugins(token).pluginBalanceOf(address(this), msg.sender);
        uint256 amount = _makeInfo().claim(msg.sender, pluginBalance);
        if (amount > 0) {
            _transferReward(rewardsToken, msg.sender, amount);
        }
    }

    function rescueFunds(IERC20 token_, uint256 amount) public virtual onlyDistributor {
        if(token_ == IERC20(address(0))) {
            payable(_distributor).sendValue(amount);
        } else {
            if (token_ == rewardsToken) {
                if (rewardsToken.balanceOf(address(this)) < _farm.farmingInfo.balance + amount) revert InsufficientFunds();
            }
            token_.safeTransfer(_distributor, amount);
        }
    }

    function farmInfo() public view returns(Farming.Info memory) {
        return _farm.farmingInfo;
    }

    function totalSupply() public view returns(uint256) {
        return _totalSupply;
    }

    function distributor() public view returns(address) {
        return _distributor;
    }

    function farmed(address account) public view virtual returns(uint256) {
        uint256 balance = IERC20Plugins(token).pluginBalanceOf(address(this), account);
        return _makeInfo().farmed(account, balance);
    }

    function _transferReward(IERC20 reward, address to, uint256 amount) internal virtual {
        reward.safeTransfer(to, amount);
    }

    function _updateBalances(address from, address to, uint256 amount) internal virtual override {
        _makeInfo().updateBalances(from, to, amount);
        if (from == address(0)) {
            _totalSupply += amount;
        }
        if (to == address(0)) {
            _totalSupply -= amount;
        }
    }

    function _makeInfo() private view returns(FarmingLib.Info memory) {
        return FarmingLib.makeInfo(totalSupply, _farm);
    }
}
