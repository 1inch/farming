// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Farming } from "../accounting/Farming.sol";

interface IFarmingPool is IERC20 {
    // Emitted when farming parameters are updated.
    event RewardUpdated(uint256 reward, uint256 duration);

    // User functions
    /**
     * @notice Stakes the farmable tokens and mints its own tokens in return.
     * @param amount The amount of tokens to stake.
     */
    function deposit(uint256 amount) external;
    /**
     * @notice Burns the contract tokens and returns the farmable tokens.
     * @param amount The amount of tokens to withdraw.
     */
    function withdraw(uint256 amount) external;
    /**
     * @notice Claims the farmed reward tokens for the caller.
     */
    function claim() external;
    /**
     * @notice Claims the farmed reward tokens for the caller
     * and withdraws the staked tokens.
     */
    function exit() external;

    // Distributor functions
    /**
     * @notice Begins farming for the specified period.
     * @param amount The amount to farm.
     * @param period The farming period.
     */
    function startFarming(uint256 amount, uint256 period) external;
    /**
     * @notice Stops farming immediately and refunds unspent rewards.
     */
    function stopFarming() external;
    /**
     * @notice Retrieves tokens that accidentally appeared on the contract.
     * @param token The address of the token to be rescued.
     * @param amount The number of tokens to rescue.
     */
    function rescueFunds(IERC20 token, uint256 amount) external;

    // View functions
    /**
     * @notice Gets information about the current farm.
     */
    function farmInfo() external view returns(Farming.Info memory);
    /**
     * @notice Gets the amount of farmed reward tokens for the account.
     * @param account The address of the account to check.
     */
    function farmed(address account) external view returns(uint256);
}
