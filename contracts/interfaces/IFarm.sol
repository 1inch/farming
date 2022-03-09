// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IFarm {
    function farmedSinceCheckpointScaled(uint256 checkpoint) external view returns(uint256 amount);
    function claimFor(address account, uint256 amount) external;

    // only owner functions
    function setDistributor(address distributor_) external;

    // only distributor functions
    function startFarming(uint256 amount, uint256 period) external;
}
