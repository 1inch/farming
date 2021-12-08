// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./IERC20Farm.sol";

interface IERC20Farmable is IERC20 {
    struct FarmingData {
        uint40 updated;
        uint216 perToken;
    }

    // function farming(IERC20Farm farm_) external view returns(FarmingData memory);
    function farmTotalSupply(IERC20Farm farm_) external view returns(uint256);
    function userCorrection(IERC20Farm farm_, address account) external view returns(int256);
    function userFarms(address account) external view returns(address[] memory);
    function farmedPerToken(IERC20Farm farm_) external view returns (uint256 fpt);
    function farmed(IERC20Farm farm_, address account) external view returns (uint256);

    function farm(IERC20Farm farm_) external;
    function exit(IERC20Farm farm_) external;
    function claim(IERC20Farm farm_) external;
    function checkpoint(IERC20Farm farm_) external;
}
