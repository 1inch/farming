// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./libs/AddressSet.sol";


interface IERC20Farm {
    function options() external view returns(uint256 finished_, uint256 duration_, uint256 reward_);
    function claimFor(address account, uint256 amount) external;
    function startFarming(uint256 amount, uint256 period) external;
}


contract ERC20Farm is IERC20Farm {
    using SafeERC20 for IERC20;
    using SafeERC20 for IERC20Metadata;

    event RewardAdded(uint256 reward, uint256 duration);

    IERC20Metadata public immutable stakingToken;
    IERC20 public immutable rewardsToken;
    bool public immutable allowSlowDown;

    uint40 public finished;
    uint40 public duration;
    uint176 public reward;

    constructor(IERC20Metadata stakingToken_, IERC20 rewardsToken_, bool allowSlowDown_) {
        stakingToken = stakingToken_;
        rewardsToken = rewardsToken_;
        allowSlowDown = allowSlowDown_;
    }

    function options() public view override returns(uint256 finished_, uint256 duration_, uint256 reward_) {
        return (finished, duration, reward);
    }

    function claimFor(address account, uint256 amount) public {
        require(msg.sender == address(stakingToken), "ERC20: Access denied");
        rewardsToken.safeTransfer(account, amount);
    }

    function startFarming(uint256 amount, uint256 period) external override {
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update farming state
        ERC20Farmable(address(stakingToken)).update(this);

        // If something left from prev farming add it to the new farming
        (uint256 prevFinish, uint256 prevDuration, uint256 prevReward) = (finished, duration, reward);
        if (block.timestamp < prevFinish) {
            require(block.timestamp + period >= prevFinish, "Farm: farming shortening denied");
            uint256 elapsed = block.timestamp + prevDuration - prevFinish;
            amount += prevReward - prevReward * elapsed / prevDuration;
            require(allowSlowDown || amount * prevDuration > prevReward * period, "Farm: can't lower speed");
        }

        require(period < 2**40, "Farm: Period too large");
        require(amount < 2**192, "Farm: Amount too large");
        (finished, duration, reward) = (uint40(block.timestamp + period), uint40(period), uint176(amount));

        emit RewardAdded(reward, period);
    }
}


abstract contract ERC20Farmable is ERC20 {
    using AddressArray for AddressArray.Data;
    using AddressSet for AddressSet.Data;

    struct FarmingData {
        uint40 updated;
        uint216 perToken;
    }

    mapping(IERC20Farm => FarmingData) public farming;
    mapping(IERC20Farm => mapping(address => int256)) public userCorrection;
    mapping(IERC20Farm => uint256) public farmTotalSupply;
    mapping(address => AddressSet.Data) private _userFarms;

    function userFarms(address account) external view returns(address[] memory) {
        return _userFarms[account].items.get();
    }

    function farmedPerToken(IERC20Farm farm_) public view returns (uint256 fpt) {
        FarmingData memory fd = farming[farm_];
        uint256 upd = fd.updated;
        fpt = fd.perToken;
        if (block.timestamp != upd) {
            uint256 supply = farmTotalSupply[farm_];
            if (supply > 0) {
                (uint256 finished, uint256 duration, uint256 reward) = farm_.options();
                if (duration > 0) {
                    fpt += (Math.min(block.timestamp, finished) - upd) * reward * 1e18 / duration / supply;
                }
            }
        }
    }

    function farmed(IERC20Farm farm_, address account) external view returns (uint256) {
        return _farmed(farm_, account, balanceOf(account), farmedPerToken(farm_));
    }

    function _farmed(IERC20Farm farm_, address account, uint256 balance, uint256 fpt) private view returns (uint256 ret) {
        if (_userFarms[account].contains(address(farm_))) {
            return uint256(int256(balance * fpt) - userCorrection[farm_][account]) / 1e18;
        }
        return uint256(userCorrection[farm_][account]);
    }

    function farm(IERC20Farm farm_) external {
        uint256 fpt = farmedPerToken(farm_);
        _update(farm_, fpt);

        uint256 balance = balanceOf(msg.sender);
        farmTotalSupply[farm_] += balance;
        userCorrection[farm_][msg.sender] = userCorrection[farm_][msg.sender] * 1e18 + int256(balance * fpt);
        require(_userFarms[msg.sender].add(address(farm_)), "ERC20Farmable: already farming");
    }

    function exit(IERC20Farm farm_) external {
        uint256 fpt = farmedPerToken(farm_);
        _update(farm_, fpt);

        uint256 balance = balanceOf(msg.sender);
        farmTotalSupply[farm_] -= balance;
        userCorrection[farm_][msg.sender] = int256(_farmed(farm_, msg.sender, balance, fpt));
        require(_userFarms[msg.sender].remove(address(farm_)), "ERC20Farmable: already exited");
    }

    function claim(IERC20Farm farm_) external {
        uint256 fpt = farmedPerToken(farm_);
        uint256 balance = balanceOf(msg.sender);
        farm_.claimFor(msg.sender, _farmed(farm_, msg.sender, balance, fpt));
        if (_userFarms[msg.sender].contains(address(farm_))) {
            userCorrection[farm_][msg.sender] = -int256(balance * fpt);
        }
        else {
            userCorrection[farm_][msg.sender] = 0;
        }
    }

    function update(IERC20Farm farm_) external {
        _update(farm_, farmedPerToken(farm_));
    }

    function _update(IERC20Farm farm_, uint256 fpt) internal {
        farming[farm_] = FarmingData({
            updated: uint40(block.timestamp),
            perToken: uint216(fpt)
        });
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        if (amount > 0) {
            address[] memory farms = _userFarms[from].items.get();
            for (uint256 i = 0; i < farms.length; i++) {
                IERC20Farm farm_ = IERC20Farm(farms[i]);
                _beforeTokenTransferForFarm(farm_, from, to, amount, farmedPerToken(farm_), true, _userFarms[to].contains(address(farm_)));
            }

            farms = _userFarms[to].items.get();
            for (uint256 i = 0; i < farms.length; i++) {
                IERC20Farm farm_ = IERC20Farm(farms[i]);
                _beforeTokenTransferForFarm(farm_, from, to, amount, farmedPerToken(farm_), _userFarms[from].contains(address(farm_)), true);
            }
        }
    }

    function _beforeTokenTransferForFarm(IERC20Farm farm_, address from, address to, uint256 amount, uint256 fpt, bool inFrom, bool inTo) internal {
        if (!inFrom || !inTo) {
            farming[farm_] = FarmingData({
                updated: uint40(block.timestamp),
                perToken: uint216(fpt)
            });
        }

        if (inFrom) {
            userCorrection[farm_][from] -= int256(amount * fpt);
            if (!inTo) {
                farmTotalSupply[farm_] -= amount;
            }
        }

        if (inTo) {
            userCorrection[farm_][to] += int256(amount * fpt);
            if (!inFrom) {
                farmTotalSupply[farm_] += amount;
            }
        }
    }
}
