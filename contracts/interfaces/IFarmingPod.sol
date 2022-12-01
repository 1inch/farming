// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@1inch/erc20-pods/contracts/interfaces/IPod.sol";

interface IFarmingPod is IPod {
    event DistributorChanged(address oldDistributor, address newDistributor);
    event RewardAdded(uint256 reward, uint256 duration);

    function farmed(address account) external view returns(uint256);
    function claim() external;

    // only owner functions
    function setDistributor(address distributor_) external;

    // only distributor functions
    function startFarming(uint256 amount, uint256 period) external;
}
