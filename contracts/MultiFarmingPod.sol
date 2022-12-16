// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@1inch/erc20-pods/contracts/Pod.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";
import "@1inch/erc20-pods/contracts/interfaces/IERC20Pods.sol";

import "./interfaces/IMultiFarmingPod.sol";
import "./FarmingLib.sol";

contract MultiFarmingPod is Pod, IMultiFarmingPod, Ownable {
    using SafeERC20 for IERC20;
    using FarmingLib for FarmingLib.Info;
    using Address for address payable;
    using AddressSet for AddressSet.Data;
    using AddressArray for AddressArray.Data;

    error ZeroFarmableTokenAddress();
    error ZeroRewardsTokenAddress();
    error SameDistributor();
    error RewardsTokenAlreadyAdded();
    error RewardsTokensLimitTooHigh(uint256);
    error RewardsTokensLimitReached();
    error RewardsTokenNotFound();

    event NewRewardToken(address token);

    uint256 public immutable rewardsTokensLimit;

    address public distributor;
    uint256 private _totalSupply;
    mapping(IERC20 => FarmingLib.Data) private _farms;
    AddressSet.Data private _rewardsTokens;

    modifier onlyDistributor {
        if (msg.sender != distributor) revert AccessDenied();
        _;
    }

    constructor(IERC20Pods farmableToken_, address rewardsToken_, uint256 rewardsTokensLimit_)
        Pod(address(farmableToken_))
    {
        if (rewardsTokensLimit_ > 5) revert RewardsTokensLimitTooHigh(rewardsTokensLimit_);
        if (address(farmableToken_) == address(0)) revert ZeroFarmableTokenAddress();
        if (rewardsToken_ == address(0)) revert ZeroRewardsTokenAddress();

        rewardsTokensLimit = rewardsTokensLimit_;
        addRewardsToken(rewardsToken_);
    }

    function getFarmInfo(IERC20 rewardsToken) external view returns(FarmAccounting.Info memory) {
        return _farms[rewardsToken].farmInfo;
    }

    function setDistributor(address distributor_) external onlyOwner {
        address oldDistributor = distributor;
        if (distributor_ == oldDistributor) revert SameDistributor();
        emit DistributorChanged(oldDistributor, distributor_);
        distributor = distributor_;
    }

    function addRewardsToken(address rewardsToken) public onlyOwner {
        if (_rewardsTokens.length() == rewardsTokensLimit) revert RewardsTokensLimitReached();
        if (!_rewardsTokens.add(rewardsToken)) revert RewardsTokenAlreadyAdded();
        emit NewRewardToken(rewardsToken);
    }

    function startFarming(IERC20 rewardsToken, uint256 amount, uint256 period) external onlyDistributor {
        if (!_rewardsTokens.contains(address(rewardsToken))) revert RewardsTokenNotFound();

        uint256 reward = _farmInfo(rewardsToken).startFarming(amount, period);
        emit RewardAdded(address(rewardsToken), reward, period);
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function totalSupply() public view returns(uint256) {
        return _totalSupply;
    }

    function farmed(IERC20 rewardsToken, address account) public view returns(uint256) {
        uint256 balance = IERC20Pods(token).podBalanceOf(address(this), account);
        return _farmInfo(rewardsToken).farmed(account, balance);
    }

    function claim(IERC20 rewardsToken) public {
        uint256 podBalance = IERC20Pods(token).podBalanceOf(address(this), msg.sender);
        _claim(rewardsToken, msg.sender, podBalance);
    }

    function _claim(IERC20 rewardsToken, address account, uint256 podBalance) internal {
        uint256 amount = _farmInfo(rewardsToken).claim(account, podBalance);
        if (amount > 0) {
            rewardsToken.safeTransfer(account, amount);
        }
    }

    function claim() external {
        uint256 podBalance = IERC20Pods(token).podBalanceOf(address(this), msg.sender);
        address[] memory tokens = _rewardsTokens.items.get();
        unchecked {
            for (uint256 i = 0; i < tokens.length; i++) {
                _claim(IERC20(tokens[i]), msg.sender, podBalance);
            }
        }
    }

    function updateBalances(address from, address to, uint256 amount) external onlyToken {
        address[] memory tokens = _rewardsTokens.items.get();
        unchecked {
            for (uint256 i = 0; i < tokens.length; i++) {
                _farmInfo(IERC20(tokens[i])).updateBalances(from, to, amount);
            }
        }
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

    function _farmInfo(IERC20 rewardsToken) internal view returns(FarmingLib.Info memory) {
        return FarmingLib.makeInfo(totalSupply, _farms[rewardsToken]);
    }
}
