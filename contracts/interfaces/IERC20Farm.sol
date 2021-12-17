// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IERC20Farm {
    function farmingCheckpoint() external;
    function farmedSinceCheckpointScaled(uint256 checkpoint) external view returns(uint256 amount);
    function startFarming(uint256 amount, uint256 period) external;
    function claimFor(address account, uint256 amount) external;
}
