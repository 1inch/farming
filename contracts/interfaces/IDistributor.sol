// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IDistributor {
    function setDistributor(address distributor_) external;

    function distributor() external view returns(address);
}
