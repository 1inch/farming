// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./interfaces/IFarm.sol";
import "./interfaces/IERC20Farmable.sol";
import "./accounting/FarmAccounting.sol";

contract Farm is IFarm, Ownable {
    using SafeERC20 for IERC20;
    using FarmAccounting for FarmAccounting.Info;
    using Address for address payable;

    error FarmableTokenAddressIsZero();
    error RewardsTokenAddressIsZero();
    error DistributorAlreadySet();
    error AccessDenied();

    event DistributorChanged(address oldDistributor, address newDistributor);
    event RewardAdded(uint256 reward, uint256 duration);

    IERC20Farmable public immutable farmableToken;
    IERC20 public immutable rewardsToken;

    address public distributor;
    FarmAccounting.Info public farmInfo;

    modifier onlyDistributor {
        if (msg.sender != distributor) revert AccessDenied();
        _;
    }

    constructor(IERC20Farmable farmableToken_, IERC20 rewardsToken_) {
        if (address(farmableToken_) == address(0)) revert FarmableTokenAddressIsZero();
        if (address(rewardsToken_) == address(0)) revert RewardsTokenAddressIsZero();
        farmableToken = farmableToken_;
        rewardsToken = rewardsToken_;
    }

    function setDistributor(address distributor_) external onlyOwner {
        address oldDistributor = distributor;
        if (distributor_ == oldDistributor) revert DistributorAlreadySet();
        emit DistributorChanged(oldDistributor, distributor_);
        distributor = distributor_;
    }

    function startFarming(uint256 amount, uint256 period) external onlyDistributor {
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 reward = farmInfo.startFarming(amount, period, _updateCheckpoint);
        emit RewardAdded(reward, period);
    }

    /// @dev Requires extra 18 decimals for precision, result should not exceed 10**54
    function farmedSinceCheckpointScaled(uint256 checkpoint) external view returns(uint256 amount) {
        return farmInfo.farmedSinceCheckpointScaled(checkpoint);
    }

    function claimFor(address account, uint256 amount) external {
        if (msg.sender != address(farmableToken)) revert AccessDenied();
        rewardsToken.safeTransfer(account, amount);
    }

    function rescueFunds(IERC20 token, uint256 amount) external onlyDistributor {
        if(token == IERC20(address(0))) {
            payable(distributor).sendValue(amount);
        } else {
            token.safeTransfer(distributor, amount);
        }
    }

    // FarmAccounting bindings

    function _updateCheckpoint() private {
        farmableToken.updateCheckpoint();
    }
}
