// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { IDistributor } from "./interfaces/IDistributor.sol";

abstract contract Distributor is IDistributor, Ownable {
    address internal _distributor;

    event DistributorChanged(address oldDistributor, address newDistributor);

    error NotDistributor();
    error SameDistributor();
    error ZeroDistributorAddress();

    modifier onlyDistributor {
        if (msg.sender != _distributor) revert NotDistributor();
        _;
    }

    function setDistributor(address distributor_) public virtual onlyOwner {
        if (distributor_ == address(0)) revert ZeroDistributorAddress();
        address oldDistributor = _distributor;
        if (distributor_ == oldDistributor) revert SameDistributor();
        emit DistributorChanged(oldDistributor, distributor_);
        _distributor = distributor_;
    }

    function distributor() public view virtual returns (address) {
        return _distributor;
    }
}
