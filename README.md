> _This document is in a status of "In Progress"_

### About

DMR (short for Distributed Message Rooms) is used as a central _proxy_ to exchange communication between Bürokratt Core and different Bürokratt Instances, but also between different Bürokratt Instances themselves.

### User stories

#### Remote software update

```
AS Bürokratt Core
I WANT all Bürokratt Instances to update their Bürokratt-related software based on input provided by us
SO THAT I could be confident that all participants of Bürokratt Network are working on up-to-date software
```

```
AS A Bürokratt Instance
I WANT my Bürokratt-related software to be always up-to-date without requiring any participation from my side
SO THAT I wouldn't need technical team to keep Bürokratt up and running
```

#### Remote observability

```
AS Bürokratt Core
I WANT TO have non-intrusive overview of Bürokratt-related technical stack and their performance of Instances part of Bürokratt Network
SO THAT I could react proactively in case of detecting problems
```

```
AS AN Instances of Bürokratt
I WANT Bürokratt Core to have non-intrusive overview of my technical stack and its performance
SO THAT they could take action to fix the problems when necessary
```

#### Forwarding messages to appropriate participants

```
AS Estonia
I WANT Estonians to get answers and e-services from one entry-point
SO THAT they wouldn't have to use different platforms and service providers
```

```
AS AN Instance of Bürokratt Network
I WANT End Clients to get answers to their questions served by other Instances of Bürokratt Network
SO THAT I wouldn't have to find the answers manually
```

### Architecture

#### Concept backed with POC

https://github.com/buerokratt/DMR.NET/blob/main/docs/design-architecture-for-dmr-related-services.doc.md

https://github.com/buerokratt/POC-DMR.Nginx

#### Initial concept

https://koodivaramu.eesti.ee/buerokratt/architecture/concepts-and-proof-of-concepts/-/tree/master/Distributed%20Message%20Rooms

### Related links

(GitHub Project for POC development](https://github.com/orgs/buerokratt/projects/3/views/1)
