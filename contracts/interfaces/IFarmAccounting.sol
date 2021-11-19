// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IFarmAccounting {
    function startFarming(uint256 amount, uint256 period) external;
}
