// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { Farming } from "./accounting/Farming.sol";
import { Rewards } from "./accounting/Rewards.sol";

/// @title FarmingLib
/// @dev A library for farming logic, using Farming and Rewards.
library FarmingLib {
    using Farming for Farming.Info;
    using Rewards for Rewards.Info;
    using FarmingLib for FarmingLib.Info;

    // TODO: check all docs and update
    /// @dev Struct containing farm and user detailed info for farming operations. See {Farming.Info} and {Rewards.Info} for.
    struct Data {
        Farming.Info farmingInfo;
        Rewards.Info rewardsInfo;
    }

    /// @dev Struct containing the total supply function and a data slot for EVM storage.
    struct Info {
        function() internal view returns(uint256) getTotalSupply;
        bytes32 dataSlot;
    }

    /**
     * @notice Creates a new Info struct.
     * @param getTotalSupply The function to get the total supply.
     * @param data The data struct for storage.
     * @return info The created Info struct.
     */
    function makeInfo(function() internal view returns(uint256) getTotalSupply, Data storage data) internal pure returns(Info memory info) {
        info.getTotalSupply = getTotalSupply;
        bytes32 dataSlot;
        assembly ("memory-safe") {  // solhint-disable-line no-inline-assembly
            dataSlot := data.slot
        }
        info.dataSlot = dataSlot;
    }

    /**
     * @notice Retrieves the Data struct from an Info struct.
     * @param self The Info struct.
     * @return data The retrieved Data struct.
     */
    function getData(Info memory self) internal pure returns(Data storage data) {
        bytes32 dataSlot = self.dataSlot;
        assembly ("memory-safe") {  // solhint-disable-line no-inline-assembly
            data.slot := dataSlot
        }
    }

    /**
     * @notice Begins farming for a specified period.
     * @param self The Info struct.
     * @param amount The amount to farm.
     * @param period The farming period.
     * @return reward The farming reward.
     */
    function updateFarmData(Info memory self, uint256 amount, uint256 period) internal returns(uint256 reward) {
        Data storage data = self.getData();
        data.rewardsInfo.updateFarmedPerToken(_farmedPerToken(self));
        reward = data.farmingInfo.update(amount, period);
    }

    /**
     * @notice Stops farming immediately.
     * @param self The FarmingLib.Info struct to retrieve data from storage.
     * @return leftover Amount of reward tokens remaining after farming.
     */
    function cancelFarming(Info memory self) internal returns(uint256 leftover) {
        Data storage data = self.getData();
        data.rewardsInfo.updateFarmedPerToken(_farmedPerToken(self));
        leftover = data.farmingInfo.cancel();
    }

    /**
     * @notice Claims the farmed amount for an account.
     * @param self The Info struct.
     * @param account The account to claim for.
     * @param balance The account balance.
     * @return amount The claimed amount.
     */
    function claim(Info memory self, address account, uint256 balance) internal returns(uint256 amount) {
        Data storage data = self.getData();
        uint256 fpt = _farmedPerToken(self);
        amount = data.rewardsInfo.farmed(account, balance, fpt);
        if (amount > 0) {
            data.rewardsInfo.eraseFarmed(account, balance, fpt);
            data.farmingInfo.claim(amount);
        }
    }

    /**
     * @notice Updates the balances of two accounts.
     * @param self The Info struct.
     * @param from The account to transfer from.
     * @param to The account to transfer to.
     * @param amount The amount to transfer.
     */
    function updateBalances(Info memory self, address from, address to, uint256 amount) internal {
        self.getData().rewardsInfo.updateBalances(from, to, amount, _farmedPerToken(self));
    }

    /**
     * @notice Gets the farmed amount for an account.
     * @param self The Info struct.
     * @param account The account to check.
     * @param balance The account balance.
     * @return result The farmed amount.
     */
    function farmed(Info memory self, address account, uint256 balance) internal view returns(uint256) {
        return self.getData().rewardsInfo.farmed(account, balance, _farmedPerToken(self));
    }

    function _farmedPerToken(Info memory self) private view returns (uint256) {
        return self.getData().rewardsInfo.farmedPerToken(_infoToContext(self), _lazyGetSupply, _lazyGetFarmed);
    }

    // --- Rewards bindings section start ---
    function _contextToInfo(bytes32 context) private pure returns(Info memory self) {
        assembly ("memory-safe") {  // solhint-disable-line no-inline-assembly
            self := context
        }
    }

    function _infoToContext(Info memory self) private pure returns(bytes32 context) {
        assembly ("memory-safe") {  // solhint-disable-line no-inline-assembly
            context := self
        }
    }

    function _lazyGetSupply(bytes32 context) private view returns(uint256) {
        Info memory self = _contextToInfo(context);
        return self.getTotalSupply();
    }

    function _lazyGetFarmed(bytes32 context, uint256 checkpoint) private view returns(uint256) {
        Info memory self = _contextToInfo(context);
        return self.getData().farmingInfo.farmedSinceCheckpointScaled(checkpoint);
    }
    // --- Rewards bindings section end ---
}
