// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { IDistributor } from "./interfaces/IDistributor.sol";

abstract contract Distributor is IDistributor, Ownable {
    address internal _distributor;

    modifier onlyDistributor {
        if (msg.sender != _distributor) revert NotDistributor();
        _;
    }

    constructor(address owner_) Ownable(owner_) {} // solhint-disable-line no-empty-blocks

    /**
     * @notice See {IDistributor-setDistributor}
     */
    function setDistributor(address distributor_) public virtual onlyOwner {
        if (distributor_ == address(0)) revert ZeroDistributorAddress();
        emit DistributorChanged(distributor_);
        _distributor = distributor_;
    }

    /**
     * @notice See {IDistributor-distributor}
     */
    function distributor() public view virtual returns (address) {
        return _distributor;
    }
}
