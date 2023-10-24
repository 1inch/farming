// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPlugin } from "@1inch/token-plugins/contracts/interfaces/IPlugin.sol";
import { FarmAccounting } from "../accounting/FarmAccounting.sol";

interface IFarmingPlugin is IPlugin {
    event FarmCreated(address token, address reward);
    event RewardUpdated(uint256 reward, uint256 duration);

    // View functions
    function totalSupply() external view returns(uint256);
    function farmInfo() external view returns(FarmAccounting.Info memory);
    function farmed(address account) external view returns(uint256);

    // User functions
    function claim() external;

    // Distributor functions
    function startFarming(uint256 amount, uint256 period) external;
    function stopFarming() external;
    function rescueFunds(IERC20 token, uint256 amount) external;
}
