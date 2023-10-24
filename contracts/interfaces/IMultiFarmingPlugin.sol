// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPlugin } from "@1inch/token-plugins/contracts/interfaces/IPlugin.sol";
import { FarmAccounting } from "../accounting/FarmAccounting.sol";

interface IMultiFarmingPlugin is IPlugin {
    event FarmCreated(address token, address reward);
    event RewardUpdated(address token, uint256 reward, uint256 duration);

    // View functions
    function totalSupply() external view returns(uint256);
    function farmInfo(IERC20 rewardsToken) external view returns(FarmAccounting.Info memory);
    function farmed(IERC20 rewardsToken, address account) external view returns(uint256);

    // User functions
    function claim(IERC20 rewardsToken) external;
    function claim() external;

    // Distributor functions
    function startFarming(IERC20 rewardsToken, uint256 amount, uint256 period) external;
    function stopFarming(IERC20 rewardsToken) external;
    function rescueFunds(IERC20 token, uint256 amount) external;
}
