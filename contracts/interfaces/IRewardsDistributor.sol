// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";


abstract contract IRewardsDistributor is Ownable {
    address public rewardsDistributor;

    modifier onlyRewardsDistributor() {
        require(_msgSender() == rewardsDistributor, "RD: caller access denied");
        _;
    }

    function setRewardsDistributor(address _rewardsDistributor) external onlyOwner {
        rewardsDistributor = _rewardsDistributor;
    }
}