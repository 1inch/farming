// SPDX-License-Identifier: MIT

pragma solidity 0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../../contracts/ERC20Farmable.sol";

contract ERC20FarmableMock is ERC20Farmable, Ownable {
    constructor(string memory name, string memory symbol, uint256 maxUserFarms)
        ERC20Farmable(maxUserFarms) ERC20(name, symbol) {}

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external onlyOwner {
        _burn(account, amount);
    }
}
