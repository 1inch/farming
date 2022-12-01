// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
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

    IERC20Pods public immutable farmableToken;
    IERC20 public immutable rewardsToken;

    address public distributor;
    uint256 private _totalSupply;
    FarmingLib.Data private _farm;

    modifier onlyDistributor {
        if (msg.sender != distributor) revert AccessDenied();
        _;
    }

    constructor(IERC20Pods farmableToken_, IERC20 rewardsToken_)
        Pod(address(farmableToken_))
    {
        if (address(farmableToken_) == address(0)) revert ZeroFarmableTokenAddress();
        if (address(rewardsToken_) == address(0)) revert ZeroRewardsTokenAddress();
        farmableToken = farmableToken_;
        rewardsToken = rewardsToken_;
    }

    function totalSupply() public view returns(uint256) {
        return _totalSupply;
    }

    function getFarmInfo() external view returns(FarmAccounting.Info memory) {
        return _farm.farmInfo;
    }

    function setDistributor(address distributor_) external onlyOwner {
        address oldDistributor = distributor;
        if (distributor_ == oldDistributor) revert SameDistributor();
        emit DistributorChanged(oldDistributor, distributor_);
        distributor = distributor_;
    }

    function startFarming(uint256 amount, uint256 period) external onlyDistributor {
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 reward = _farmInfo().startFarming(amount, period);
        emit RewardAdded(reward, period);
    }

    function farmed(address account) public view returns(uint256) {
        uint256 balance = farmableToken.podBalanceOf(address(this), account);
        return _farmInfo().farmed(account, balance);
    }

    function claim() external {
        uint256 podBalance = farmableToken.podBalanceOf(address(this), msg.sender);
        uint256 amount = _farmInfo().claim(msg.sender, podBalance);
        if (amount > 0) {
            rewardsToken.safeTransfer(msg.sender, amount);
        }
    }

    function updateBalances(address from, address to, uint256 amount) external onlyToken {
        _farmInfo().updateBalances(from, to, amount);
        if (from == address(0)) {
            _totalSupply += amount;
        }
        if (to == address(0)) {
            _totalSupply -= amount;
        }
    }

    function rescueFunds(IERC20 token, uint256 amount) external onlyDistributor {
        if(token == IERC20(address(0))) {
            payable(distributor).sendValue(amount);
        } else {
            token.safeTransfer(distributor, amount);
        }
    }

    function _farmInfo() internal view returns(FarmingLib.Info memory) {
        return FarmingLib.makeInfo(totalSupply, _farm);
    }
}
