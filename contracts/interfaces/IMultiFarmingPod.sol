// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/erc20-pods/contracts/interfaces/IPod.sol";
import "../accounting/FarmAccounting.sol";

interface IMultiFarmingPod is IPod {
    event FarmCreated(address token, address reward);
    event DistributorChanged(address oldDistributor, address newDistributor);
    event RewardAdded(address token, uint256 reward, uint256 duration);

    // View functions
    function totalSupply() external view returns(uint256);
    function distributor() external view returns(address);
    function farmInfo(IERC20 rewardsToken) external view returns(FarmAccounting.Info memory);
    function farmed(IERC20 rewardsToken, address account) external view returns(uint256);

    // User functions
    function claim(IERC20 rewardsToken) external;
    function claim() external;

    // Owner functions
    function setDistributor(address distributor_) external;

    // Distributor functions
    function startFarming(IERC20 rewardsToken, uint256 amount, uint256 period) external;
    function rescueFunds(IERC20 token, uint256 amount) external;
}
