// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IFarmingPool {
    function farmed(address account) external view returns (uint256);
    function farmedPerToken() external view returns (uint256);

    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function claim() external;
    function exit() external;
}
