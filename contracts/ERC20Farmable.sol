// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./libs/AddressSet.sol";

interface IERC20Farm {
    function options() external view returns(uint256 finished_, uint256 duration_, uint256 reward_);
    function notifyRewardAmount(uint256 amount, uint256 period) external;
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

    function notifyRewardAmount(uint256 amount, uint256 period) external override {
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update farming state
        ERC20Farmable(address(stakingToken)).update(this);

        // If something left from prev farming add it to the new farming
        (uint256 prevFinish, uint256 prevDuration, uint256 prevReward) = (finished, duration, reward);
        if (block.timestamp < prevFinish) {
            uint256 elapsed = block.timestamp + prevDuration - prevFinish;
            amount += prevReward - prevReward * elapsed / prevDuration;
            require(allowSlowDown || amount * prevDuration > prevReward * period, "Farm: can't lower speed");
        }

        require(period < 2**40, "Farm: Period too large");
        require(amount < 2**192 && amount <= rewardsToken.balanceOf(address(this)), "Farm: Amount too large");
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

    mapping(IERC20Farm => FarmingData) private _farming;
    mapping(IERC20Farm => mapping(address => uint256)) private _userFarmed;
    mapping(IERC20Farm => mapping(address => uint256)) private _userFarmedPerToken;
    mapping(IERC20Farm => uint256) private _farmTotalSupply;
    mapping(address => AddressSet.Data) private _userFarms;

    function farm(IERC20Farm farm_) public {
        _farmTotalSupply[farm_] += balanceOf(msg.sender);
        require(_userFarms[msg.sender].add(address(farm_)), "ERC20F: already farming");
    }

    function exit(IERC20Farm farm_) public {
        _farmTotalSupply[farm_] -= balanceOf(msg.sender);
        require(_userFarms[msg.sender].remove(address(farm_)), "ERC20F: already exited");
    }

    function update(IERC20Farm farm_) public {
        _farming[farm_] = FarmingData({
            updated: uint40(block.timestamp),
            perToken: uint216(farmedPerToken(farm_))
        });
    }

    function farmingUpdated(IERC20Farm farm_) public view returns (uint256) {
        return _farming[farm_].updated;
    }

    function farmedPerToken(IERC20Farm farm_) public view returns (uint256 fpt) {
        FarmingData memory fd = _farming[farm_];
        uint256 upd = fd.updated;
        fpt = fd.perToken;
        if (block.timestamp != upd) {
            uint256 supply = totalSupply();
            if (supply > 0) {
                (, uint256 duration, uint256 reward) = farm_.options();
                fpt += (block.timestamp - upd) * reward * 1e18 / duration / supply;
            }
        }
    }

    function farmed(IERC20Farm farm_, address account) public view returns (uint256) {
        return _farmed(farm_, account, farmedPerToken(farm_));
    }

    function _farmed(IERC20Farm farm_, address account, uint256 fpt) private view returns (uint256) {
        return _userFarmed[farm_][account] + balanceOf(account) * (fpt - _userFarmedPerToken[farm_][account]) / 1e18;
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        if (amount > 0) {
            address[] memory farms = _userFarms[from].items.get();
            for (uint256 i = 0; i < farms.length; i++) {
                IERC20Farm farm_ = IERC20Farm(farms[i]);
                uint256 fpt = farmedPerToken(farm_);

                if (from == address(0) || to == address(0)) {
                    _farming[farm_] = FarmingData({
                        updated: uint40(block.timestamp),
                        perToken: uint216(fpt)
                    });
                }

                if (from != address(0)) {
                    _userFarmed[farm_][from] = _farmed(farm_, from, fpt);
                    _userFarmedPerToken[farm_][from] = fpt;
                }

                if (to != address(0)) {
                    _userFarmed[farm_][to] = _farmed(farm_, to, fpt);
                    _userFarmedPerToken[farm_][to] = fpt;
                }

                if (!_userFarms[to].contains(address(farm_))) {
                    _farmTotalSupply[farm_] -= amount;
                }
            }

            farms = _userFarms[to].items.get();
            for (uint256 i = 0; i < farms.length; i++) {
                IERC20Farm farm_ = IERC20Farm(farms[i]);
                uint256 fpt = farmedPerToken(farm_);

                if (from == address(0) || to == address(0)) {
                    _farming[farm_] = FarmingData({
                        updated: uint40(block.timestamp),
                        perToken: uint216(fpt)
                    });
                }

                if (from != address(0)) {
                    _userFarmed[farm_][from] = _farmed(farm_, from, fpt);
                    _userFarmedPerToken[farm_][from] = fpt;
                }

                if (to != address(0)) {
                    _userFarmed[farm_][to] = _farmed(farm_, to, fpt);
                    _userFarmedPerToken[farm_][to] = fpt;
                }

                if (!_userFarms[from].contains(address(farm_))) {
                    _farmTotalSupply[farm_] += amount;
                }
            }
        }
    }
}
