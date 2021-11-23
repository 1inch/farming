// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IFarmAccounting {
    function farmingCheckpoint() external;
    function farmedSinceCheckpoint(uint256 checkpoint) external view returns(uint256 amount);
    function startFarming(uint256 amount, uint256 period) external;
}
