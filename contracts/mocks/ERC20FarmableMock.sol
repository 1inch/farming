// SPDX-License-Identifier: MIT

pragma solidity 0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@1inch/erc20-pods/contracts/ERC20Pods.sol";

contract ERC20FarmableMock is ERC20Pods, Ownable {
    constructor(string memory name, string memory symbol, uint256 maxUserFarms)
        ERC20Pods(maxUserFarms) ERC20(name, symbol) {}

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external onlyOwner {
        _burn(account, amount);
    }
}
