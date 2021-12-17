// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IFarm.sol";

interface IERC20Farm is IFarm {
    function claimFor(address account, uint256 amount) external;
}
