// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./FarmAccounting.sol";

contract FarmingPool is ERC20, FarmAccounting {
    using SafeERC20 for IERC20;

    // Update this slot on deposit and withdrawals only
    uint40 public farmedPerTokenUpdated;
    uint216 public farmedPerTokenStored;
    mapping(address => int256) public userCorrection;

    constructor(IERC20 stakingToken_, IERC20 rewardsToken_)
        FarmAccounting(stakingToken_, rewardsToken_)
        ERC20("", "")
    {}  // solhint-disable-line no-empty-blocks

    function name() public view override returns (string memory) {
        return string(abi.encodePacked("Farming of ", IERC20Metadata(address(stakingToken)).name()));
    }

    function symbol() public view override returns (string memory) {
        return string(abi.encodePacked("farm", IERC20Metadata(address(stakingToken)).symbol()));
    }

    function decimals() public view override returns (uint8) {
        return IERC20Metadata(address(stakingToken)).decimals();
    }

    function farmed(address account) public view returns (uint256) {
        return _farmed(account, farmedPerToken());
    }

    function _farmed(address account, uint256 fpt) internal view returns (uint256) {
        return uint256(int256(balanceOf(account) * fpt) - userCorrection[account]) / 1e18;
    }

    function farmedPerToken() public view returns (uint256 fpt) {
        uint256 upd = farmedPerTokenUpdated;
        fpt = farmedPerTokenStored;
        if (block.timestamp != upd) {
            uint256 supply = totalSupply();
            if (supply > 0) {
                (uint256 finished_, uint256 duration_, uint256 reward_) = (finished, duration, reward);
                if (finished_ > 0) {
                    fpt += (Math.min(block.timestamp, finished_) - upd) * reward_ * 1e18 / duration_ / supply;
                }
            }
        }
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
            userCorrection[msg.sender] = -int256(balanceOf(msg.sender) * fpt);
            rewardsToken.safeTransfer(msg.sender, amount);
        }
    }

    function exit() public {
        withdraw(balanceOf(msg.sender));
        claim();
    }

    function _updateFarmingState() internal override {
        (farmedPerTokenUpdated, farmedPerTokenStored) = (uint40(block.timestamp), uint216(farmedPerToken()));
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        super._beforeTokenTransfer(from, to, amount);

        if (amount > 0) {
            uint256 fpt = farmedPerToken();

            if (from == address(0) || to == address(0)) {
                (farmedPerTokenUpdated, farmedPerTokenStored) = (uint40(block.timestamp), uint216(fpt));
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
