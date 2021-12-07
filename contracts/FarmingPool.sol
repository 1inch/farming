// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./interfaces/IFarmingPool.sol";
import "./FarmAccounting.sol";

contract FarmingPool is ERC20, FarmAccounting {
    using SafeERC20 for IERC20;

    // Update this slot on deposit and withdrawals only
    uint40 public farmedPerTokenUpdated;
    uint216 public farmedPerTokenStored;
    mapping(address => int256) public userCorrection;

    constructor(IERC20Metadata stakingToken_, IERC20 rewardsToken_)
        FarmAccounting(stakingToken_, rewardsToken_)
        ERC20(
            string(abi.encodePacked("Farming of ", stakingToken_.name())),
            string(abi.encodePacked("farm", stakingToken_.symbol()))
        )
    {}  // solhint-disable-line no-empty-blocks

    function decimals() public view override returns (uint8) {
        return IERC20Metadata(address(stakingToken)).decimals();
    }

    function farmed(address account) public view returns (uint256) {
        return _farmed(account, farmedPerToken());
    }

    function _farmed(address account, uint256 fpt) internal view returns (uint256) {
        return uint256(int256(balanceOf(account) * fpt) - userCorrection[account]) / 1e18;
    }

    function farmedPerToken() public view returns (uint256) {
        (uint256 upd, uint256 fpt) = (farmedPerTokenUpdated, farmedPerTokenStored);
        if (block.timestamp != upd) {
            uint256 supply = totalSupply();
            if (supply > 0) {
                fpt += farmedSinceCheckpoint(upd) / supply;
            }
        }
        return fpt;
    }

    function deposit(uint256 amount) external {
        _mint(msg.sender, amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) public {
        _burn(msg.sender, amount);
        stakingToken.safeTransfer(msg.sender, amount);
    }

    function claim() public {
        uint256 fpt = farmedPerToken();
        uint256 amount = _farmed(msg.sender, fpt);
        if (amount > 0) {
            // todo: add test and fix "-" to "+"
            userCorrection[msg.sender] = -int256(balanceOf(msg.sender) * fpt);
            rewardsToken.safeTransfer(msg.sender, amount);
        }
    }

    function exit() public {
        withdraw(balanceOf(msg.sender));
        claim();
    }

    function farmingCheckpoint() public override {
        _farmingCheckpoint(farmedPerToken());
    }

    function _farmingCheckpoint(uint256 fpt) private {
        (farmedPerTokenUpdated, farmedPerTokenStored) = (uint40(block.timestamp), uint216(fpt));
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        super._beforeTokenTransfer(from, to, amount);

        if (amount > 0) {
            uint256 fpt = farmedPerToken();

            if (from == address(0) || to == address(0)) {
                _farmingCheckpoint(fpt);
            }
            else { // solhint-disable-line no-empty-blocks
                // revert("FP: transfers denied");
            }

            if (from != address(0)) {
                userCorrection[from] -= int256(amount * fpt);
            }

            if (to != address(0)) {
                userCorrection[to] += int256(amount * fpt);
            }
        }
    }
}
