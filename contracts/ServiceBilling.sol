pragma solidity ^0.4.19;

import "./ServiceMonitoring.sol";
import "./Hosting.sol";

contract ServiceBilling is ServiceMonitoring {
    event ContractEndDateUpdated(uint date);
    event useableCustomerFundsEvent(uint forCustomer);
    event ContractCalculationUpdated(uint time);
    event DaysSinceLastUpdate(uint _days);
    event availabilityForDay(uint start, uint val);

    // Billing
    uint endDate; // time until the service is active
    uint lastCalculationDate = now; // Date when the costs have been calculated last and service has been paid
    uint withdrawableForProvider; // service fee that is withdrawable for the provider

    //Flag for testing
    bool withSLACalc = true;

    function setWithSLACalc(bool _state) public {
        withSLACalc = _state;
    }


    function withdraw(uint _amount) public onlyPartners {
        // Transfers contract funds to customer's address
        require(_amount <= (address(this).balance - withdrawableForProvider));
        customer.transfer(_amount);
    }

    function withdrawProvider() public onlyProvider {
        // Transfers payout to provider
        msg.sender.transfer(withdrawableForProvider);
        withdrawableForProvider = 0;
    }

    function recalculateServiceDuration() public {
        require(isActive, "Require _contract to be active!");
        // Restrict to daily contract updates for easier payout calculation;
        uint daysSinceLastUpdate = (now - lastCalculationDate) / 1 days;
        emit DaysSinceLastUpdate(daysSinceLastUpdate);
        //uint daysSinceLastUpdate = 1;
        require(daysSinceLastUpdate >= 1, "Calculation is only daily, please wait");

        uint calcIntervalBegin = lastCalculationDate;
        uint calcIntervalEnd = lastCalculationDate + daysSinceLastUpdate * 1 days;

        uint providerPenalty = 100;

        if (withSLACalc) {
            uint availability;
            // calculate the SLA adherence and penalty
            uint start = calcIntervalBegin;
            for (uint i = 1; i <= daysSinceLastUpdate; i++) {
                availability = calculateServiceLevel(start, start + 1 days);
                emit availabilityForDay(start, availability);
                start = start + 1 days;
                providerPenalty = (providerPenalty * (i - 1) + calculatePenalty(availability)) / i;
            }
        }
        /*
        emit Log("Penalty: ");
        emit LogNumber(providerPenalty);
        */
        uint earningsProviderSinceLastUpdate = costPerDay * daysSinceLastUpdate * providerPenalty / 100;
        withdrawableForProvider += earningsProviderSinceLastUpdate;

        uint newDurationInDays = 1 days * (useableCustomerFunds() / costPerDay);
        endDate = now + newDurationInDays;
        updateLastCalculationDate(calcIntervalEnd);

        emit ContractEndDateUpdated(endDate);
    }

    function useableCustomerFunds() public view onlyPartners returns (uint){
        uint forCustomer = (address(this).balance - withdrawableForProvider);
        //emit useableCustomerFundsEvent(forCustomer);
        return forCustomer;
    }

    //TODO make private after testing!
    function updateLastCalculationDate(uint _date) public {
        emit ContractCalculationUpdated(_date);
        lastCalculationDate = _date;
    }

    function getEndDate() public view onlyPartners returns (uint){
        return endDate;
    }

    function getLastUpdated() public view onlyPartners returns (uint){
        return lastCalculationDate;
    }

    function getBalance() public view onlyPartners returns (uint){
        return address(this).balance;
    }

    function getWithdrawableForProvider() public view onlyProvider returns (uint){
        return withdrawableForProvider;
    }
}
