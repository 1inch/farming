// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IWithdrawableGetters } from "./interfaces/IWithdrawableGetters.sol";

abstract contract WithdrawableGetters is IWithdrawableGetters {
    /**
     * @notice See {IWithdrawableGetters-withdrawable}.
     */
    function withdrawable(IERC20 token_) public view returns(uint256) {
        return _withdrawable(token_, block.timestamp);
    }

    /**
     * @notice See {IWithdrawableGetters-withdrawable}.
     */
    function withdrawable(IERC20 token_, uint256 timestamp) public view returns(uint256) {
        return _withdrawable(token_, timestamp);
    }

    function _withdrawable(IERC20 token_, uint256 timestamp) internal view virtual returns(uint256) {}
}