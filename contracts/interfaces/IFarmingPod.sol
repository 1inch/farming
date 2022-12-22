// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/erc20-pods/contracts/interfaces/IPod.sol";
import "../accounting/FarmAccounting.sol";

interface IFarmingPod is IPod {
    event FarmCreated(address token, address reward);
    event DistributorChanged(address oldDistributor, address newDistributor);
    event RewardAdded(uint256 reward, uint256 duration);

    // View functions
    function totalSupply() external view returns(uint256);
    function distributor() external view returns(address);
    function farmInfo() external view returns(FarmAccounting.Info memory);
    function farmed(address account) external view returns(uint256);

    // User functions
    function claim() external;

    // Owner functions
    function setDistributor(address distributor_) external;

    // Distributor functions
    function startFarming(uint256 amount, uint256 period) external;
    function rescueFunds(IERC20 token, uint256 amount) external;
}
