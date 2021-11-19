// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract DistributorAccess is Ownable {
    address public distributor;

    modifier onlyDistributor {
        require(msg.sender == distributor, "RD: caller access denied");
        _;
    }

    function setDistributor(address _distributor) external onlyOwner {
        distributor = _distributor;
    }
}
