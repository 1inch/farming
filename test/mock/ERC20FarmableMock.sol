// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../../contracts/ERC20Farmable.sol";
import "../../contracts/interfaces/IERC20Farm.sol";


contract ERC20FarmableMock is ERC20Farmable, Ownable {
    // solhint-disable-next-line no-empty-blocks
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external onlyOwner {
        _burn(account, amount);
    }
	
	function claimFor(address farm, address account, uint256 amount) external onlyOwner {
    	IERC20Farm(farm).claimFor(account, amount);
    }
}
