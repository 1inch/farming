// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@1inch/erc20-pods/contracts/Pod.sol";
import "@1inch/erc20-pods/contracts/interfaces/IERC20Pods.sol";

import "./accounting/FarmAccounting.sol";
import "./accounting/UserAccounting.sol";
import "./interfaces/IFarm.sol";

contract Farm is Pod, IFarm, Ownable {
    using SafeERC20 for IERC20;
    using FarmAccounting for FarmAccounting.Info;
    using UserAccounting for UserAccounting.Info;
    using Address for address payable;

    error ZeroFarmableTokenAddress();
    error ZeroRewardsTokenAddress();
    error SameDistributor();

    event DistributorChanged(address oldDistributor, address newDistributor);
    event RewardAdded(uint256 reward, uint256 duration);

    IERC20Pods public immutable farmableToken;
    IERC20 public immutable rewardsToken;

    address public distributor;
    uint256 public totalSupply;
    FarmAccounting.Info public farmInfo;
    UserAccounting.Info public userInfo;

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

    function setDistributor(address distributor_) external onlyOwner {
        address oldDistributor = distributor;
        if (distributor_ == oldDistributor) revert SameDistributor();
        emit DistributorChanged(oldDistributor, distributor_);
        distributor = distributor_;
    }

    function startFarming(uint256 amount, uint256 period) external onlyDistributor {
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);

        userInfo.updateFarmedPerToken(_farmedPerToken());
        uint256 reward = farmInfo.startFarming(amount, period);
        emit RewardAdded(reward, period);
    }

    function farmed(address account) public view returns(uint256) {
        uint256 balance = farmableToken.podBalanceOf(address(this), account);
        return userInfo.farmed(account, balance, _farmedPerToken());
    }

    function claim() external {
        uint256 fpt = _farmedPerToken();
        uint256 balance = farmableToken.podBalanceOf(address(this), msg.sender);
        uint256 amount = userInfo.farmed(msg.sender, balance, fpt);
        userInfo.eraseFarmed(msg.sender, balance, fpt);

        rewardsToken.safeTransfer(msg.sender, amount);
    }

    function updateBalances(address from, address to, uint256 amount) external onlyToken {
        userInfo.updateBalances(_farmedPerToken(), from, to, amount);
        if (from == address(0)) {
            totalSupply += amount;
        }
        if (to == address(0)) {
            totalSupply -= amount;
        }
    }

    function rescueFunds(IERC20 token, uint256 amount) external onlyDistributor {
        if(token == IERC20(address(0))) {
            payable(distributor).sendValue(amount);
        } else {
            token.safeTransfer(distributor, amount);
        }
    }

    function _farmedPerToken() private view returns (uint256) {
        return userInfo.farmedPerToken(_lazyGetSupply, _lazyGetFarmed);
    }

    // UserAccounting bindings

    function _lazyGetSupply() private view returns(uint256) {
        return totalSupply;
    }

    function _lazyGetFarmed(uint256 checkpoint) private view returns(uint256) {
        return farmInfo.farmedSinceCheckpointScaled(checkpoint);
    }
}
