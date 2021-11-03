// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../Farm.sol";

contract FarmMock is Farm {
    // solhint-disable-next-line no-empty-blocks
    constructor(IERC20 _gift) public Farm(_gift) {}

    // solhint-disable-next-line private-vars-leading-underscore
    function __mint(address account, uint256 amount) external virtual {
        _mint(account, amount);
    }

    // solhint-disable-next-line private-vars-leading-underscore
    function __burn(address account, uint256 amount) external virtual {
        _burn(account, amount);
    }
}
