// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPlugin } from "@1inch/token-plugins/contracts/interfaces/IPlugin.sol";
import { Farming } from "../accounting/Farming.sol";

interface IMultiFarmingPlugin is IPlugin {
    // Emitted when a new reward token is added.
    event FarmCreated(address token, address reward);
    // Emitted when farming parameters are updated.
    event RewardUpdated(address token, uint256 reward, uint256 duration);

    // User functions
    /**
     * @notice Claims the selected farmed reward tokens for the caller.
     * @param rewardsToken The address of the reward token.
     */
    function claim(IERC20 rewardsToken) external;
    /**
     * @notice Claims for the caller all farmed reward tokens supported by the plugin.
     */
    function claim() external;

    // Distributor functions
    /**
     * @notice Begins farming for the selected reward token for the specified period.
     * @param rewardsToken The address of the reward token.
     * @param amount The amount to farm.
     * @param period The farming period.
     */
    function startFarming(IERC20 rewardsToken, uint256 amount, uint256 period) external;
    /**
     * @notice Stops farming for the selected reward token immediately and refunds unspent rewards.
     * @param rewardsToken The address of the reward token.
     */
    function stopFarming(IERC20 rewardsToken) external;
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
     * @notice Gets information about the current farm for the selected reward token.
     * @param rewardsToken The address of the reward token.
     */
    function farmInfo(IERC20 rewardsToken) external view returns(Farming.Info memory);
    /**
     * @notice Gets the amount of selected reward tokens farmed for the account.
     * @param rewardsToken The address of the reward token.
     * @param account The address of the account to check.
     */
    function farmed(IERC20 rewardsToken, address account) external view returns(uint256);
    /**
     * Gets all reward tokens that are supported by this plugin.
     */
    function rewardsTokens() external view returns(address[] memory);
}
