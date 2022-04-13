// SPDX-License-Identifier: MIT

pragma solidity 0.8.12;

contract EthTransferMock  {
    function transfer(address receiver) external payable {
        selfdestruct(payable(receiver));
    }
}
