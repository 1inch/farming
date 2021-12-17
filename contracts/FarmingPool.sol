// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./interfaces/IFarmingPool.sol";
import "./accounting/FarmAccounting.sol";
import "./accounting/UserAccounting.sol";

contract FarmingPool is IFarmingPool, Ownable, ERC20, FarmAccounting, UserAccounting {
    using SafeERC20 for IERC20;

    event RewardAdded(uint256 reward, uint256 duration);

    address private constant _FARM = address(0);

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    UserInfo public info;
    FarmInfo public farmInfo;
    address public distributor;

    constructor(IERC20Metadata stakingToken_, IERC20 rewardsToken_)
        ERC20(
            string(abi.encodePacked("Farming of ", stakingToken_.name())),
            string(abi.encodePacked("farm", stakingToken_.symbol()))
        )
    {
        stakingToken = stakingToken_;
        rewardsToken = rewardsToken_;
    }

    function setDistributor(address distributor_) external onlyOwner {
        distributor = distributor_;
    }

    function decimals() public view override returns (uint8) {
        return IERC20Metadata(address(stakingToken)).decimals();
    }

    function farmed(address account) public view override returns (uint256) {
        return _farmed(info, _FARM, account);
    }

    function farmedPerToken() external view override returns (uint256) {
        return _farmedPerToken(info, _FARM);
    }

    function deposit(uint256 amount) external override {
        _mint(msg.sender, amount);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) public override {
        _burn(msg.sender, amount);
        stakingToken.safeTransfer(msg.sender, amount);
    }

    function claim() public override {
        uint256 fpt = _farmedPerToken(info, _FARM);
        uint256 balance = _balanceOf(_FARM, msg.sender);
        uint256 amount = _farmed(info, msg.sender, balance, fpt);
        if (amount > 0) {
            _eraseFarmed(info, msg.sender, balance, fpt);
            rewardsToken.safeTransfer(msg.sender, amount);
        }
    }

    function exit() public override {
        withdraw(balanceOf(msg.sender));
        claim();
    }

    /// @dev Use block.timestamp for checkpoint if needed, try not to revert
    function farmingCheckpoint() public virtual override {
        _userCheckpoint(info, _farmedPerToken(info, _FARM));
        _farmingCheckpoint(farmInfo);
    }

    /// @dev Requires extra 18 decimals for precision, result should not exceed 10**54
    function farmedSinceCheckpointScaled(uint256 updated) public view virtual override returns(uint256 amount) {
        return _farmedSinceCheckpointScaled(farmInfo, updated);
    }

    function startFarming(uint256 amount, uint256 period) external {
        require(msg.sender == distributor, "FA: access denied");
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);

        uint256 reward = _startFarming(farmInfo, amount, period);

        emit RewardAdded(reward, period);
    }

    function _updateFarmingState() internal override {
        _userCheckpoint(info, _farmedPerToken(info, _FARM));
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        if (amount > 0) {
            _beforeBalancesChanged(info, _farmedPerToken(info, _FARM), from, to, amount, from != _FARM, to != _FARM);
        }
    }

    // UserAccounting Overrides

    function _balanceOf(address /* farm */, address user) internal view override returns(uint256) {
        return balanceOf(user);
    }

    function _totalSupply(address /* farm */) internal view override returns(uint256) {
        return totalSupply();
    }

    function _farmedSinceCheckpointScaled(address /* farm */, uint256 updated) internal view override returns(uint256) {
        return _farmedSinceCheckpointScaled(farmInfo, updated);
    }
}
