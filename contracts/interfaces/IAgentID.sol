// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal view of the Agent ID contract (ERC-721, non-transferable) used for gating.
interface IAgentID {
    function balanceOf(address owner) external view returns (uint256);
}
