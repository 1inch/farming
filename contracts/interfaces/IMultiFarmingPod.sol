// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/erc20-pods/contracts/interfaces/IPod.sol";

interface IMultiFarmingPod is IPod {
    function farmed(IERC20 rewardsToken, address account) external view returns(uint256);
    function claim(IERC20 rewardsToken) external;
    function claim() external;

    // only owner functions
    function setDistributor(address distributor_) external;

    // only distributor functions
    function startFarming(IERC20 rewardsToken, uint256 amount, uint256 period) external;
}
