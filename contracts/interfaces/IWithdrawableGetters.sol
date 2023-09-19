// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface IWithdrawableGetters {
/**
     * @notice Gets amount of tokens that can be withdrawn by the distributor.
     * @param token_ Address of the token to be withdrawn
     * @return Amount of tokens that can be withdrawn
     */
    function withdrawable(IERC20 token_) external view returns(uint256);

    /**
     * @notice Gets amount of tokens that can be withdrawn by the distributor at the specified timestamp.
     * @param token_ Address of the token to be withdrawn
     * @param timestamp Timestamp to calculate withdrawable amount
     * @return Amount of tokens that can be withdrawn
     */
    function withdrawable(IERC20 token_, uint256 timestamp) external view returns(uint256);
}