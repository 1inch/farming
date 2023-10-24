// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IDistributor {
    /**
     * @notice Sets the entity that can manage the farming
     */
    function setDistributor(address distributor_) external;

    /**
     * @notice Returns the entity that can manage the farming
     */
    function distributor() external view returns(address);
}
