// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPlugin } from "@1inch/token-plugins/contracts/interfaces/IPlugin.sol";
import { Farming } from "../accounting/Farming.sol";

interface IMultiFarmingPlugin is IPlugin {
    event FarmCreated(address token, address reward);
    event DistributorChanged(address oldDistributor, address newDistributor);
    event RewardUpdated(address token, uint256 reward, uint256 duration);

    // View functions
    function totalSupply() external view returns(uint256);
    function distributor() external view returns(address);
    function farmInfo(IERC20 rewardsToken) external view returns(Farming.Info memory);
    function farmed(IERC20 rewardsToken, address account) external view returns(uint256);

    // User functions
    function claim(IERC20 rewardsToken) external;
    function claim() external;

    // Owner functions
    function setDistributor(address distributor_) external;

    // Distributor functions
    function startFarming(IERC20 rewardsToken, uint256 amount, uint256 period) external;
    function rescueFunds(IERC20 token, uint256 amount) external;
}
