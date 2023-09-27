// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPlugin } from "@1inch/token-plugins/contracts/interfaces/IPlugin.sol";
import { Farming } from "../accounting/Farming.sol";

interface IFarmingPlugin is IPlugin {
    // Emitted in constructor when the plugin is set up.
    event FarmCreated(address token, address reward);
    // Emitted when farming parameters are updated.
    event RewardUpdated(uint256 reward, uint256 duration);

    // User functions
    /**
     * @notice Claims the farmed reward tokens for the caller.
     */
    function claim() external;

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
     * @param token_ The address of the token to be rescued.
     * @param amount The number of tokens to rescue.
     */
    function rescueFunds(IERC20 token_, uint256 amount) external;

    // View functions
    /**
     * Returns the number of farmable tokens counted by this plugin.
     */
    function totalSupply() external view returns(uint256);
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
