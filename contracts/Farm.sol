// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";


contract Farm is ERC20 {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    event RewardAdded(uint256 reward, uint256 duration);

    IERC20Metadata public immutable stakingToken;
    IERC20 public immutable rewardsToken;
    bool public immutable allowSlowDown;

    // Update this slot once every new farming starts
    uint40 public finished;
    uint40 public duration;
    uint176 public reward;

    // Update this slot on deposit and withdrawals only
    uint40 public farmingUpdated;
    uint216 public farmedPerTokenStored;
    mapping(address => uint256) public userFarmedPerToken;
    mapping(address => uint256) public userFarmed;

    constructor(IERC20Metadata stakingToken_, IERC20 rewardsToken_, bool allowSlowDown_) ERC20("", "") {
        stakingToken = stakingToken_;
        rewardsToken = rewardsToken_;
        allowSlowDown = allowSlowDown_;
    }

    function name() public view override returns (string memory) {
        return string(abi.encodePacked("Farming of ", stakingToken.name()));
    }

    function symbol() public view override returns (string memory) {
        return string(abi.encodePacked("farm", stakingToken.symbol()));
    }

    function decimals() public view override returns (uint8) {
        return stakingToken.decimals();
    }

    function farmed(address account) public view returns (uint256) {
        return _farmed(account, farmedPerToken());
    }

    function _farmed(address account, uint256 fpt) internal view returns (uint256) {
        return userFarmed[account] + balanceOf(account) * (fpt - userFarmedPerToken[account]) / 1e18;
    }

    function farmedPerToken() public view returns (uint256 fpt) {
        uint256 upd = farmingUpdated;
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
            userFarmed[msg.sender] = 0;
            userFarmedPerToken[msg.sender] = fpt;
            rewardsToken.safeTransfer(msg.sender, amount);
        }
    }

    function exit() public {
        withdraw(balanceOf(msg.sender));
        claim();
    }

    function notifyRewardAmount(uint256 amount, uint256 period) external {
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update farming state
        (farmingUpdated, farmedPerTokenStored) = (uint40(block.timestamp), uint176(farmedPerToken()));

        // If something left from prev farming add it to the new farming
        (uint256 prevFinish, uint256 prevDuration, uint256 prevReward) = (finished, duration, reward);
        if (block.timestamp < prevFinish) {
            uint256 elapsed = block.timestamp + prevDuration - prevFinish;
            amount += prevReward - prevReward * elapsed / prevDuration;
            require(allowSlowDown || amount * prevDuration > prevReward * period, "Farm: can't lower speed");
        }

        require(period < 2**40, "Farm: Period too large");
        require(amount < 2**192, "Farm: Amount too large");
        (finished, duration, reward) = (uint40(block.timestamp + period), uint40(period), uint176(amount));

        emit RewardAdded(reward, period);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        if (amount > 0) {
            uint256 fpt = farmedPerToken();

            if (from == address(0) || to == address(0)) {
                (farmingUpdated, farmedPerTokenStored) = (uint40(block.timestamp), uint216(fpt));
            }
            else { // solhint-disable-line no-empty-blocks
                // revert("Farm: transfers denied");
            }

            if (from != address(0)) {
                userFarmed[from] = _farmed(from, fpt);
                userFarmedPerToken[from] = fpt;
            }

            if (to != address(0)) {
                userFarmed[to] = _farmed(to, fpt);
                userFarmedPerToken[to] = fpt;
            }
        }
    }
}
