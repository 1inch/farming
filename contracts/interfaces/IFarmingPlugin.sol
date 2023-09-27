// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPlugin } from "@1inch/token-plugins/contracts/interfaces/IPlugin.sol";
import { Farming } from "../accounting/Farming.sol";

interface IFarmingPlugin is IPlugin {
    event FarmCreated(address token, address reward);
    event RewardUpdated(uint256 reward, uint256 duration);

    // User functions
    function claim() external;

    // Distributor functions
    function startFarming(uint256 amount, uint256 period) external;
    function rescueFunds(IERC20 token, uint256 amount) external;

    // View functions
    function totalSupply() external view returns(uint256);
    function farmInfo() external view returns(Farming.Info memory);
    function farmed(address account) external view returns(uint256);
}
