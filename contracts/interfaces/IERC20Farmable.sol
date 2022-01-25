// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./IFarm.sol";

interface IERC20Farmable is IERC20 {
    function farmTotalSupply(address farm_) external view returns(uint256);
    function userIsFarming(address account, address famr_) external view returns(bool);
    function userFarms(address account) external view returns(address[] memory);
    function farmedPerToken(address farm_) external view returns (uint256 fpt);
    function farmed(address farm_, address account) external view returns (uint256);

    function farm(address farm_) external;
    function exit(address farm_) external;
    function claim(address farm_) external;
    function updateCheckpoint() external;
}
