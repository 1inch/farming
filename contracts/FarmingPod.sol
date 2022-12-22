// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/erc20-pods/contracts/Pod.sol";
import "@1inch/erc20-pods/contracts/interfaces/IERC20Pods.sol";

import "./interfaces/IFarmingPod.sol";
import "./FarmingLib.sol";

contract FarmingPod is Pod, IFarmingPod, Ownable {
    using SafeERC20 for IERC20;
    using FarmingLib for FarmingLib.Info;
    using Address for address payable;

    error ZeroFarmableTokenAddress();
    error ZeroRewardsTokenAddress();
    error SameDistributor();

    IERC20 public immutable rewardsToken;

    address private _distributor;
    uint256 private _totalSupply;
    FarmingLib.Data private _farm;

    modifier onlyDistributor {
        if (msg.sender != _distributor) revert AccessDenied();
        _;
    }

    constructor(IERC20Pods farmableToken_, IERC20 rewardsToken_)
        Pod(farmableToken_)
    {
        if (address(farmableToken_) == address(0)) revert ZeroFarmableTokenAddress();
        if (address(rewardsToken_) == address(0)) revert ZeroRewardsTokenAddress();
        rewardsToken = rewardsToken_;
        emit FarmCreated(address(farmableToken_), address(rewardsToken_));
    }

    function farmInfo() public view returns(FarmAccounting.Info memory) {
        return _farm.farmInfo;
    }

    function totalSupply() public view returns(uint256) {
        return _totalSupply;
    }

    function distributor() public view returns(address) {
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

    function farmed(address account) public view virtual returns(uint256) {
        uint256 balance = IERC20Pods(token).podBalanceOf(address(this), account);
        return _makeInfo().farmed(account, balance);
    }

    function claim() public virtual {
        uint256 podBalance = IERC20Pods(token).podBalanceOf(address(this), msg.sender);
        uint256 amount = _makeInfo().claim(msg.sender, podBalance);
        if (amount > 0) {
            _transferReward(rewardsToken, msg.sender, amount);
        }
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

    function rescueFunds(IERC20 token, uint256 amount) public virtual onlyDistributor {
        if(token == IERC20(address(0))) {
            payable(_distributor).sendValue(amount);
        } else {
            token.safeTransfer(_distributor, amount);
        }
    }

    function _makeInfo() private view returns(FarmingLib.Info memory) {
        return FarmingLib.makeInfo(totalSupply, _farm);
    }
}
